import { useTranslation } from 'react-i18next';
import { Info, ListChecks, ShieldCheck, Workflow, User, Link } from "lucide-react";
import { APP_VERSION } from "../fileSystem.js";
import authorPhoto from "../assets/author.jpg";

const LATTES_URL = "http://lattes.cnpq.br/8653086621957741";

const Card = ({ icon, title, children }) => {
  const Icon = icon;
  return (
    <div className="bg-gray-100 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5">
      <h3 className="text-sm sm:text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
        <Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        {title}
      </h3>
      <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed space-y-2">
        {children}
      </div>
    </div>
  );
};

const List = ({ items, ordered = false }) => {
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <Tag className={`${ordered ? 'list-decimal' : 'list-disc'} pl-5 space-y-1`}>
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </Tag>
  );
};

const AboutSection = () => {
  const { t } = useTranslation();
  const asList = (key) => {
    const value = t(key, { returnObjects: true });
    return Array.isArray(value) ? value : [];
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6 transition-colors duration-200">
      <h2 className="text-lg sm:text-2xl font-bold text-gray-800 dark:text-white mb-2 flex items-center gap-2">
        <Info className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
        {t('about.sectionTitle')}
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {t('about.version', { version: APP_VERSION })}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card icon={Info} title={t('about.whatTitle')}>
          <p>{t('about.whatText')}</p>
          <List items={asList('about.features')} />
        </Card>

        <Card icon={Workflow} title={t('about.workflowTitle')}>
          <List ordered items={asList('about.workflow')} />
        </Card>

        <Card icon={ShieldCheck} title={t('about.privacyTitle')}>
          <List items={asList('about.privacy')} />
        </Card>

        <Card icon={ListChecks} title={t('about.assistTitle')}>
          <p>{t('about.assistText')}</p>
          <List items={asList('about.assistStages')} />
          <p>{t('about.assistDecision')}</p>
          <p>{t('about.assistCost')}</p>
        </Card>

        <Card icon={User} title={t('about.authorTitle')}>
          <div className="flex items-center gap-4">
            <img
              src={authorPhoto}
              alt="Guilherme Silva"
              className="h-20 w-20 sm:h-24 sm:w-24 rounded-full object-cover border border-gray-200 dark:border-gray-700 shrink-0"
            />
            <div className="min-w-0">
              <p className="font-medium text-gray-700 dark:text-gray-300">Guilherme Silva</p>
              <p>{t('about.authorLocation')}</p>
              <a
                href={LATTES_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <Link size={14} />
                {t('about.lattes')}
              </a>
            </div>
          </div>
          <p className="pt-2">{t('about.authorBio')}</p>
        </Card>

        <Card icon={Info} title={t('about.techTitle')}>
          <p>{t('about.techText')}</p>
        </Card>
      </div>
    </div>
  );
};

export default AboutSection;
