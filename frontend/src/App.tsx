import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { Toaster } from 'sonner';

export default function App() {
  return (
    <>
      <Toaster position="top-center" toastOptions={{ className: 'font-sans' }} />
      <RouterProvider router={router} />
    </>
  );
}
