// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { readPagePath, type PageScreen } from './addresses';
import { api, ApiError, type Me } from './api';
import { appearanceQuery, useAccent, useImportedFont } from './appearance';
import { useCapabilities } from './capabilities';
import { mayCreate } from './create-permission';
import { keepSettingsTyping } from './kept-fields';
import { forgetPersonalData, forgetSharedDocuments, PersonProvider } from './personal';
import { Link, match, navigate, useLocation } from './router';
import { applyTheme } from './preferences';
import { NewDatabaseDialog, NewPageDialog, NewPostDialog, NewSpaceDialog } from './components/create';
import { useCanonicalSpaceAddress, useCreateTarget } from './components/current-space';
import { AccountBar, BrandMark } from './components/account-frame';
import { SpaceShell } from './components/frame';
import { IconChevronDown, IconPlus } from './components/icons';
import { Menu, MenuItem } from './components/menu';
import { TemplateGallery } from './components/template-gallery';
import { NotificationBell } from './components/notifications';
import { QuickSearch } from './components/quick-search';
import { IdleWarning, ReauthProvider } from './components/session';
import { ShortcutsProvider, useShortcut } from './components/shortcuts';
import { SiteNotes } from './components/site-notes';
import { ToastProvider } from './components/toast';
import { SidebarProvider, SidebarSlot } from './components/sidebar-state';
import { AccountMenu, HelpMenu, SettingsButton } from './components/topbar';
import { ErrorNote, Loading } from './components/ui';
import { ForgotView, InvitationView, ResetView, SignupView } from './views/account-links';
import { accountSectionAt } from './views/account-sections';
import { AccountView, SecondFactorAccount } from './views/account-view';
import { AdminView } from './views/admin';
import { ContentView } from './views/content';
import { DirectoryView } from './views/directory';
import { GroupView } from './views/group';
import { StartScreen } from './views/home';
import { DraftsView, FavouritesView, RecentView } from './views/lists';
import { LoginView } from './views/login';
import { SetupView } from './views/setup';
import { ArchiveView, BlogView, LabelsView, LabelView, MissingPage } from './views/organise';
import { NotificationsView, WatchingView } from './views/notifications';
import { EditView } from './views/edit';
import { ExportView } from './views/exchange';
import { CompareView, HistoryView } from './views/history';
import { FilesView } from './views/files';
import { ReleaseView } from './views/releases';
import { SpaceOverviewView } from './views/overview';
import { PageView } from './views/page';
import { PeopleView, PersonView } from './views/people';
import { SearchView } from './views/search';
import { SitesView } from './views/sites';
import { SpaceHome, TrashView } from './views/space';
import { SpaceSettingsView } from './views/space-settings';
import { SpaceAccessView, SpaceAuditView, SpacePeopleView } from './views/space-access';
import { TasksView } from './views/tasks';
import { TemplatesView, TemplateView } from './views/templates';
import { TemplateSettingsView } from './views/template-settings';
import { UnsubscribeView } from './views/unsubscribe';
import { PageInsightsView, SpaceInsightsView } from './views/insights';
import { RulesView, RuleView } from './views/rules';
import { WebhooksView } from './views/webhooks';
import { HomeFrame } from './components/home-frame';

type Creating = 'page' | 'template' | 'post' | 'database' | 'space' | null;

/** These need no session: they are how a person gets one. */
const PUBLIC_SCREENS: Record<string, () => ReactNode> = {
  '/login': () => <LoginView />,
  '/forgot': () => <ForgotView />,
  '/reset': () => <ResetView />,
  '/invitation': () => <InvitationView />,
  '/signup': () => <SignupView />,
  '/setup': () => <SetupView />,
};

type Offered = Record<'page' | 'database' | 'post', boolean>;

/**
 * What the Create button makes at once: a page first, then what else the person may make in
 * the space, so someone who may only write blog posts gets a post (spec 045).
 */
function mainCreation(offered: Offered, canCreateSpace: boolean): Creating {
  for (const kind of ['page', 'database', 'post'] as const) {
    if (offered[kind]) return kind;
  }
  return canCreateSpace ? 'space' : null;
}

function CreateButton({ me, onCreate }: { me: Me; onCreate: (what: Creating) => void }) {
  const { t } = useTranslation();
  const target = useCreateTarget();
  const canCreateSpace = me.global_permissions.includes('create_space');
  const can = target?.space.can;
  const blog = target?.space.features?.blog ?? true;
  const capabilities = useCapabilities();
  const offered: Offered = {
    page: mayCreate(can, 'page'),
    database: capabilities.databases && mayCreate(can, 'database'),
    post: blog && mayCreate(can, 'post'),
  };
  const main = mainCreation(offered, canCreateSpace);
  useShortcut('create', () => {
    if (main) onCreate(main);
  });
  if (!main) return null;
  return (
    <span className="top-create">
      <button type="button" className="primary" onClick={() => onCreate(main)}>
        <IconPlus size={16} /> {t('nav.create')}
      </button>
      {target && (
        <Menu
          label={t('nav.createMenu')}
          align="start"
          className="primary top-create-more"
          trigger={<IconChevronDown size={16} />}
        >
          {offered.page && <MenuItem onClick={() => onCreate('page')}>{t('space.newPage')}</MenuItem>}
          {offered.database && <MenuItem onClick={() => onCreate('database')}>{t('sheet.new')}</MenuItem>}
          {offered.page && (
            <MenuItem onClick={() => onCreate('template')}>{t('organise.fromTemplate')}</MenuItem>
          )}
          {offered.post && <MenuItem onClick={() => onCreate('post')}>{t('blog.newPost')}</MenuItem>}
          {canCreateSpace && <MenuItem onClick={() => onCreate('space')}>{t('home.newSpace')}</MenuItem>}
        </Menu>
      )}
    </span>
  );
}

/** The top bar of every screen outside Your account (NAV-090). */
function TopBar({
  me,
  onCreate,
  onLogout,
}: {
  me: Me;
  onCreate: (what: Creating) => void;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const name = useQuery(appearanceQuery).data?.name;
  return (
    // Three groups: the sidebar button and the name; search with Create; the round buttons.
    <header className="top">
      <div className="top-start">
        <SidebarSlot />
        <Link href="/" className="brand">
          <BrandMark /> {name || t('app.name')}
        </Link>
      </div>
      <div className="top-middle">
        <QuickSearch />
        <CreateButton me={me} onCreate={onCreate} />
      </div>
      <div className="top-end">
        <NotificationBell />
        <HelpMenu />
        <SettingsButton me={me} />
        <AccountMenu me={me} onLogout={onLogout} />
      </div>
    </header>
  );
}

function Shell({ me, children }: { me: Me; children: ReactNode }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const target = useCreateTarget();
  const [creating, setCreating] = useState<Creating>(null);
  // Your account has a bar of its own in place of the top bar (spec 084, ACC-102).
  const account = accountSectionAt(useLocation().pathname);
  // Someone can leave without logging out, so the next person clears what they left.
  const person = me.user.id;
  useEffect(() => {
    void forgetSharedDocuments(person);
  }, [person]);
  // Text typed into settings forms outlives a reload offered for a new version (spec 043).
  useEffect(() => keepSettingsTyping(), []);
  const logout = async () => {
    await api.post('/auth/logout');
    forgetPersonalData();
    await forgetSharedDocuments();
    client.clear();
    navigate('/login');
  };
  return (
    <SidebarProvider>
      <a className="skip" href="#main">
        {t('app.skip')}
      </a>
      {account ? (
        <AccountBar me={me} current={account} onLogout={() => void logout()} />
      ) : (
        <TopBar me={me} onCreate={setCreating} onLogout={() => void logout()} />
      )}
      <SiteNotes me={me} />
      {children}
      <IdleWarning minutes={me.idle_minutes} />
      {creating === 'page' && target && (
        <NewPageDialog space={target.space} parent={target.parent} onClose={() => setCreating(null)} />
      )}
      {creating === 'template' && target && (
        <TemplateGallery space={target.space} parent={target.parent} onClose={() => setCreating(null)} />
      )}
      {creating === 'database' && target && (
        <NewDatabaseDialog space={target.space} parent={target.parent} onClose={() => setCreating(null)} />
      )}
      {creating === 'post' && target && (
        <NewPostDialog space={target.space} onClose={() => setCreating(null)} />
      )}
      {creating === 'space' && <NewSpaceDialog onClose={() => setCreating(null)} />}
    </SidebarProvider>
  );
}

function Plain({ width, children }: { width?: 'reading'; children: ReactNode }) {
  return (
    <main id="main" className={`plain ${width ?? ''}`}>
      {children}
    </main>
  );
}

/** A page and its screens, at either form of its address (spec 094); the frame puts the canonical one in the bar. */
function PageRoute({ id, screen }: { id: string; screen: PageScreen | null }) {
  switch (screen) {
    case 'edit':
      return (
        <SpaceShell pageId={id} screen={screen} focus>
          <EditView pageId={id} />
        </SpaceShell>
      );
    case 'insights':
      return (
        <SpaceShell pageId={id} screen={screen}>
          <PageInsightsView pageId={id} />
        </SpaceShell>
      );
    case 'history':
      return (
        <SpaceShell pageId={id} screen={screen}>
          <HistoryView pageId={id} />
        </SpaceShell>
      );
    case 'compare':
      return (
        <SpaceShell pageId={id} screen={screen}>
          <CompareView pageId={id} />
        </SpaceShell>
      );
    default:
      return (
        <SpaceShell pageId={id}>
          <PageView pageId={id} />
        </SpaceShell>
      );
  }
}

function Routes({ me }: { me: Me }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  useCanonicalSpaceAddress();
  let m;
  if (pathname === '/') {
    return (
      <HomeFrame width="reading">
        <StartScreen me={me} />
      </HomeFrame>
    );
  }
  const account = accountSectionAt(pathname);
  if (account) return <AccountView me={me} section={account} />;
  if ((m = match('/search', pathname))) {
    return (
      <Plain width="reading">
        <SearchView />
      </Plain>
    );
  }

  if ((m = match('/people', pathname))) {
    return (
      <Plain width="reading">
        <PeopleView />
      </Plain>
    );
  }
  if ((m = match('/people/:id', pathname))) {
    return (
      <Plain width="reading">
        <PersonView id={m.id ?? ''} />
      </Plain>
    );
  }
  if ((m = match('/groups/:id', pathname))) {
    return (
      <Plain width="reading">
        <GroupView id={m.id ?? ''} />
      </Plain>
    );
  }

  if ((m = match('/notifications', pathname))) {
    return (
      <Plain width="reading">
        <NotificationsView />
      </Plain>
    );
  }

  if ((m = match('/me/watching', pathname))) {
    return (
      <HomeFrame width="reading">
        <WatchingView />
      </HomeFrame>
    );
  }
  if ((m = match('/drafts', pathname))) {
    return (
      <HomeFrame width="reading">
        <DraftsView />
      </HomeFrame>
    );
  }
  if ((m = match('/tasks', pathname))) {
    return (
      <HomeFrame width="reading">
        <TasksView />
      </HomeFrame>
    );
  }
  if ((m = match('/recent', pathname))) {
    return (
      <HomeFrame width="reading">
        <RecentView />
      </HomeFrame>
    );
  }
  if ((m = match('/favourites', pathname))) {
    return (
      <HomeFrame width="reading">
        <FavouritesView />
      </HomeFrame>
    );
  }
  if ((m = match('/spaces', pathname))) {
    return (
      <HomeFrame>
        <DirectoryView me={me} />
      </HomeFrame>
    );
  }
  if ((m = match('/labels', pathname))) {
    return (
      <Plain width="reading">
        <LabelsView />
      </Plain>
    );
  }
  if ((m = match('/labels/:label', pathname))) {
    return (
      <Plain width="reading">
        <LabelView label={m.label ?? ''} />
      </Plain>
    );
  }
  if ((m = match('/blog', pathname))) {
    return (
      <Plain width="reading">
        <BlogView />
      </Plain>
    );
  }
  if ((m = match('/templates/:id/settings', pathname)))
    return <TemplateSettingsView templateId={m.id ?? ''} />;
  if ((m = match('/templates/:id/edit', pathname))) {
    return (
      <main id="main" className="focus">
        <TemplateView templateId={m.id ?? ''} />
      </main>
    );
  }
  if ((m = match('/admin', pathname))) return <AdminView tab="summary" me={me} />;
  if ((m = match('/admin/:tab', pathname))) return <AdminView tab={m.tab ?? 'summary'} me={me} />;
  if ((m = match('/spaces/:key', pathname))) return <SpaceHome spaceKey={m.key ?? ''} />;
  if ((m = match('/spaces/:key/overview', pathname))) return <SpaceOverviewView spaceKey={m.key ?? ''} />;
  if ((m = match('/spaces/:key/files', pathname))) return <FilesView spaceKey={m.key ?? ''} />;
  if ((m = match('/spaces/:key/release', pathname))) return <ReleaseView spaceKey={m.key ?? ''} />;
  if ((m = match('/spaces/:key/settings', pathname))) return <SpaceSettingsView spaceKey={m.key ?? ''} />;
  if ((m = match('/spaces/:key/settings/automation', pathname))) return <RulesView spaceKey={m.key ?? ''} />;
  if ((m = match('/spaces/:key/settings/webhooks', pathname))) return <WebhooksView spaceKey={m.key ?? ''} />;
  if ((m = match('/spaces/:key/insights', pathname))) return <SpaceInsightsView spaceKey={m.key ?? ''} />;
  if ((m = match('/rules/:id', pathname))) return <RuleView ruleId={m.id ?? ''} />;
  if ((m = match('/spaces/:key/trash', pathname))) return <TrashView spaceKey={m.key ?? ''} />;
  if ((m = match('/spaces/:key/sites', pathname))) return <SitesView spaceKey={m.key ?? ''} />;
  if ((m = match('/exports/:id', pathname))) return <ExportView id={m.id ?? ''} />;
  if ((m = match('/spaces/:key/access', pathname))) return <SpaceAccessView spaceKey={m.key ?? ''} />;
  if ((m = match('/spaces/:key/people', pathname))) return <SpacePeopleView spaceKey={m.key ?? ''} />;
  if ((m = match('/spaces/:key/audit', pathname))) return <SpaceAuditView spaceKey={m.key ?? ''} />;
  if ((m = match('/spaces/:key/content', pathname))) return <ContentView spaceKey={m.key ?? ''} />;
  if ((m = match('/spaces/:key/blog', pathname))) return <BlogView spaceKey={m.key ?? ''} />;
  if ((m = match('/spaces/:key/archive', pathname))) return <ArchiveView spaceKey={m.key ?? ''} />;
  if ((m = match('/spaces/:key/labels', pathname))) return <LabelsView spaceKey={m.key ?? ''} />;
  if ((m = match('/spaces/:key/templates', pathname))) return <TemplatesView spaceKey={m.key ?? ''} />;
  if ((m = match('/spaces/:key/new', pathname))) return <MissingPage spaceKey={m.key ?? ''} />;
  const shown = readPagePath(pathname);
  if (shown) return <PageRoute id={shown.id} screen={shown.screen} />;
  return (
    <Plain width="reading">
      <p role="alert">{t('app.notFound')}</p>
    </Plain>
  );
}

export function App() {
  const { pathname } = useLocation();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<Me>('/me') });
  useImportedFont();
  useAccent();
  const theme = me.data?.preferences.theme;
  useEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);

  const publicScreen = PUBLIC_SCREENS[pathname];
  if (publicScreen) return publicScreen();
  // Mail links reach people who are not signed in, so this comes before the login check.
  const unsubscribe = match('/unsubscribe/:token', pathname);
  if (unsubscribe) return <UnsubscribeView token={unsubscribe.token ?? ''} />;
  if (me.isPending) return <Loading />;
  if (me.error) {
    if (me.error instanceof ApiError && me.error.status === 401) {
      const here = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + window.location.search)}`;
      navigate(`/login${here}`, true);
      return null;
    }
    return <ErrorNote error={me.error} />;
  }
  return (
    <ToastProvider>
      <ReauthProvider>
        {me.data.needs_second_factor ? (
          <SecondFactorAccount me={me.data} />
        ) : (
          <ShortcutsProvider enabled={me.data.preferences.shortcuts}>
            <PersonProvider value={me.data.user.id}>
              <Shell me={me.data}>
                <Routes me={me.data} />
              </Shell>
            </PersonProvider>
          </ShortcutsProvider>
        )}
      </ReauthProvider>
    </ToastProvider>
  );
}
