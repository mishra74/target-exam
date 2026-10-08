'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Menu, User as UserIcon } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import Logo from '@/public/logo.png';
import { LanguageSwitcher } from './language-switcher';
import { NotificationBell } from './notification-bell';
import { MobileNav } from './mobile-nav';
import { Button} from '@/components/ui/button';
import Image from 'next/image';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';

const NAV_LINKS = [
  { href: '/dashboard', key: 'dashboard' },
  { href: '/my-exams', key: 'myExams' },
  { href: '/practice', key: 'practice' },
  { href: '/live-tests', key: 'liveTests' },
  { href: '/current-affairs', key: 'currentAffairs' },
  { href: '/notes', key: 'notes' },
  { href: '/performance', key: 'performance' },
] as const;

export function Header() {
  const t = useTranslations('nav');
  const { user, status, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="shrink-0">
          <Image src={Logo} alt="Target ExamTak" width={90} height={90} className="h-13 w-13 object-contain" />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Button key={link.href} variant="ghost" size="sm" asChild>
              <Link href={link.href}>{t(link.key)}</Link>
            </Button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LanguageSwitcher className="hidden sm:inline-flex" />
          <NotificationBell />

          <div className="hidden md:block">
            {status === 'authenticated' && user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <UserIcon className="h-4 w-4" />
                    {user.name.split(' ')[0]}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard">{t('dashboard')}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/profile">{t('profile')}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/my-test-series">{t('myTestSeries')}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/coins">{t('coins')}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/my-coupons">{t('myCoupons')}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => logout()} className="text-destructive">
                    {t('logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : status === 'loading' ? (
              <div className="h-9 w-20 animate-pulse rounded-full bg-muted" />
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/login">{t('login')}</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/signup">{t('signup')}</Link>
                </Button>
              </div>
            )}
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-secondary lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label={t('menu')}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      <MobileNav open={mobileOpen} onOpenChange={setMobileOpen} links={NAV_LINKS} />
    </header>
  );
}
