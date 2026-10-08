import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

import Image from 'next/image';
import Logo from '@/public/logo.png';


export function Footer() {
  const t = useTranslations('footer');
  const nav = useTranslations('nav');
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-border bg-secondary/40">
      <div className="container grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          
          <Image src={Logo} alt="Target ExamTak" width={90} height={90} className="h-13 w-13 object-contain" />
        </div>

        <div>
          <h4 className="mb-3 text-sm font-semibold">{t('quickLinks')}</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link href="/test-series" className="hover:text-foreground">{nav('testSeries')}</Link></li>
            <li><Link href="/current-affairs" className="hover:text-foreground">{nav('currentAffairs')}</Link></li>
            <li><Link href="/blogs" className="hover:text-foreground">{nav('blogs')}</Link></li>
            <li><Link href="/videos" className="hover:text-foreground">{nav('videos')}</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="mb-3 text-sm font-semibold">{t('quickLinks')}</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link href="/login" className="hover:text-foreground">{nav('login')}</Link></li>
            <li><span className="cursor-default">{t('privacyPolicy')}</span></li>
            <li><span className="cursor-default">{t('termsConditions')}</span></li>
            <li><span className="cursor-default">{t('refundPolicy')}</span></li>
          </ul>
        </div>

        <div>
          <h4 className="mb-3 text-sm font-semibold">{t('contactUs')}</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>Patna, Bihar</li>
            <li>+91 91359 04639</li>
            <li>support@testmela.com</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        © {year} Test Mela. {t('rightsReserved')}
      </div>
    </footer>
  );
}
