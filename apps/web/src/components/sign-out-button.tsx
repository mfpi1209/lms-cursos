'use client';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await authClient.signOut();
        router.replace('/login');
        router.refresh();
      }}
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      Sair
    </Button>
  );
}
