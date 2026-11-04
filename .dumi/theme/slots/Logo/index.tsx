import { Link, useLocale, useSiteData } from 'dumi';

export default function Logo() {
  const { themeConfig } = useSiteData();
  const locale = useLocale();

  return (
    <Link className="finwork-brand" to={'base' in locale ? locale.base : '/'} aria-label="FinWork Kit 首页">
      <img src={themeConfig.logo || undefined} alt="" />
      <span>Fin<span className="finwork-brand-work">Work</span> Kit</span>
    </Link>
  );
}
