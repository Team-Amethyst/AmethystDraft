import { Router, Request, Response, NextFunction, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";
import League from "../models/League";
import PlayerNote from "../models/PlayerNote";
import WatchlistEntry from "../models/WatchlistEntry";
import RosterEntry from "../models/RosterEntry";
import CustomPlayer from "../models/CustomPlayer";
import { validate } from "../validation/validate";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  updateProfileSchema,
  changePasswordSchema,
  // deleteAccountSchema,
} from "../validation/schemas";
import {
  UnauthorizedError,
  ConflictError,
  ForbiddenError,
  NotFoundError
} from "../lib/appError";
import authMiddleware, { AuthRequest } from "../middleware/auth";

// Explicit type annotation fixes the portable type error on Router()
const router: Router = Router();

// POST /api/auth/register
const register: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { displayName, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new ConflictError("Email already in use", 409, "EMAIL_IN_USE");
    }

    const user = await User.create({
      displayName,
      email,
      passwordHash: password,
    });

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" },
    );

    res.status(201).json({
      token,
      user: {
        id: user._id,
        displayName: user.displayName,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  } catch (err) { // CHANGED: Catch block now forwards to next() instead of sending response directly
    next(err);
  }
};

// POST /api/auth/login
const login: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      throw new UnauthorizedError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new UnauthorizedError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    user.lastLogin = new Date();
    await User.updateOne({ _id: user._id }, { lastLogin: user.lastLogin });

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" },
    );

    res.json({
      token,
      user: {
        id: user._id,
        displayName: user.displayName,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/forgot-password
const forgotPassword: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    // Always return same response to prevent email enumeration attacks
    if (!user) {
      res.json({ message: "If that email exists, a reset link has been sent" });
      return;
    }

    // TODO: generate reset token and send via nodemailer or similar
    res.json({ message: "If that email exists, a reset link has been sent" });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/auth/me
const updateProfile: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user!;
    const { displayName, email } = req.body;

    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        throw new ConflictError("Email already in use", 409, "EMAIL_IN_USE");
      }
    }

    user.displayName = displayName ?? user.displayName;
    user.email = email ?? user.email;
    await user.save();

    res.json({
      user: {
        id: user._id,
        displayName: user.displayName,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/change-password
const changePassword: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user!;
    const { currentPassword, newPassword } = req.body;

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      throw new UnauthorizedError("Current password is incorrect", 401, "INVALID_CURRENT_PASSWORD");
    }

    user.passwordHash = newPassword;
    await user.save();

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/auth/users/:id
const deleteAccount: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedError("Unauthorized", 401, "UNAUTHORIZED");
    }
    
    if (String(user._id) !== String(req.params.id)) {
      throw new ForbiddenError("You can only delete your own account", 403, "FORBIDDEN");
    }

    // Password-confirmed deletion flow (kept for quick restore if required later):
    // const { currentPassword } = req.body as { currentPassword?: string };
    // if (!currentPassword) {
    //   throw new UnauthorizedError(
    //     "Password confirmation is required",
    //     401,
    //     "PASSWORD_CONFIRMATION_REQUIRED",
    //   );
    // }
    // const isMatch = await user.comparePassword(currentPassword);
    // if (!isMatch) {
    //   throw new UnauthorizedError(
    //     "Current password is incorrect",
    //     401,
    //     "INVALID_CURRENT_PASSWORD",
    //   );
    // }

    const userId = user._id;

    // Remove custom players created by this user.
    await CustomPlayer.deleteMany({ userId: userId.toString() });

    // 1) Remove all user-created custom players
    
    // 2) Remove user-owned leagues entirely.
    const ownedLeagues = await League.find({ commissionerId: userId }).select("_id").lean();
    const ownedLeagueIds = ownedLeagues.map((l) => l._id);
    if (ownedLeagueIds.length > 0) {
      await Promise.all([
        RosterEntry.deleteMany({ leagueId: { $in: ownedLeagueIds } }),
        PlayerNote.deleteMany({ leagueId: { $in: ownedLeagueIds } }),
        WatchlistEntry.deleteMany({ leagueId: { $in: ownedLeagueIds } }),
        League.deleteMany({ _id: { $in: ownedLeagueIds } }),
      ]);
    }

    // 3) Remove user from member lists in leagues they joined but do not own.
    await League.updateMany(
      {
        commissionerId: { $ne: userId },
        memberIds: userId,
      },
      {
        $pull: { memberIds: userId },
      },
    );

    // 4) Remove user-scoped league data in remaining leagues.
    await Promise.all([
      RosterEntry.deleteMany({ userId }),
      PlayerNote.deleteMany({ userId }),
      WatchlistEntry.deleteMany({ userId }),
    ]);

    // 5) Delete account.
    const deleted = await User.findByIdAndDelete(userId);
    if (!deleted) {
      throw new NotFoundError("User not found", 404, "USER_NOT_FOUND");
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
};


router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword);
router.patch("/me", authMiddleware, validate(updateProfileSchema), updateProfile);
router.post("/change-password", authMiddleware, validate(changePasswordSchema), changePassword);
router.delete("/users/:id", authMiddleware, deleteAccount);
// Password-confirmed deletion route variant:
// router.delete("/users/:id", authMiddleware, validate(deleteAccountSchema), deleteAccount);

export default router;
