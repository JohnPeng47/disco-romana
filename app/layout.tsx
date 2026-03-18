import './globals.css';
import { GameProvider } from '@components/GameProvider';

export const metadata = {
  title: 'Disco Romana',
  description: 'Text-based grand strategy in the Late Roman Republic',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <GameProvider>{children}</GameProvider>
      </body>
    </html>
  );
}
