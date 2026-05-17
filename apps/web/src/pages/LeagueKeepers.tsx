import { Navigate, useParams } from "react-router";

/** Legacy `/keepers` URL → settings Keepers tab. */
export default function LeagueKeepersRedirect() {
  const { id } = useParams();
  if (!id) return <Navigate to="/leagues" replace />;
  return (
    <Navigate to={`/leagues/${id}/settings?section=keepers`} replace />
  );
}
