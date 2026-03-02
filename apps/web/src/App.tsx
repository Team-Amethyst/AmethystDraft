import { RouterProvider } from 'react-router';
import { router } from './routes';
import { WatchlistProvider } from './contexts/WatchlistContext';

export default function App() {
  return (
    <WatchlistProvider>
      <RouterProvider router={router} />
    </WatchlistProvider>
  );
}