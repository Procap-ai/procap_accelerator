import { Routes } from '@angular/router';

import { LoginComponent } from './pages/login/login';
import { UtilsComponent } from './pages/utils/utils';
import { PlaywrightConvertHomeComponent } from './pages/playwright-convert-home/playwright-convert-home';
import { PlaywrightConvertJobComponent } from './pages/playwright-convert-job/playwright-convert-job';
import { ConvertHomeComponent } from './pages/convert-home/convert-home';
import { ConvertJobComponent } from './pages/convert-job/convert-job';
import { CodeLabComponent } from './pages/samples/code-lab/code-lab';
import { VisualSearchComponent } from './pages/samples/visual-search/visual-search';
import { ObservatoryShellComponent } from './pages/quality/shell/observatory-shell';
import { QualityComponent } from './pages/quality/quality';
import { CommandCenterComponent } from './pages/quality/command/command-center';
import { QualitySessionComponent } from './pages/quality/session/quality-session';
import { OptimizeComponent } from './pages/quality/optimize/optimize';
import { QueueComponent } from './pages/quality/queue/queue';
import { AdherenceComponent } from './pages/quality/adherence/adherence';
import { SavingsComponent } from './pages/quality/savings/savings';
import { GenomeComponent } from './pages/quality/genome/genome';
import { ConfigurationComponent } from './pages/quality/config/configuration';
import { AssuranceComponent } from './pages/quality/assurance/assurance';
import { BusinessAssuranceGapsComponent } from './pages/quality/assurance-gaps/business-assurance-gaps';
import { SuitePredictionComponent } from './pages/quality/prediction/suite-prediction';
import { AgenticComponent } from './pages/quality/agentic/agentic';
import { MaestroShellComponent } from './pages/maestro/shell/maestro-shell';
import { MaestroHomeComponent } from './pages/maestro/home/maestro-home';
import { MaestroTargetComponent } from './pages/maestro/target/maestro-target';
import { MaestroRunComponent } from './pages/maestro/run/maestro-run';
import { authGuard, loginGuard } from './auth.guard';

export const routes: Routes = [
  // SSO login wall (Option A) — gates the whole app; APIs stay ungated.
  { path: 'login', component: LoginComponent, canActivate: [loginGuard] },

  // Home is now the Meridian quality workspace.
  { path: '', redirectTo: 'quality', pathMatch: 'full' },

  // Legacy migration converters — demoted to Utils, reached from the sidebar.
  { path: 'utils', component: UtilsComponent, canActivate: [authGuard] },
  { path: 'playwright-convert', component: PlaywrightConvertHomeComponent, canActivate: [authGuard] },
  { path: 'playwright-convert/job/:id', component: PlaywrightConvertJobComponent, canActivate: [authGuard] },
  { path: 'mabl-convert', component: ConvertHomeComponent, canActivate: [authGuard] },
  { path: 'mabl-convert/job/:id', component: ConvertJobComponent, canActivate: [authGuard] },
  {
    path: 'quality',
    component: ObservatoryShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', component: CommandCenterComponent },
      { path: 'fleet', component: QualityComponent },
      { path: 'session/:id', component: QualitySessionComponent },
      { path: 'session/:id/optimize', component: OptimizeComponent },
      { path: 'queue', component: QueueComponent },
      { path: 'adherence', component: AdherenceComponent },
      { path: 'savings', component: SavingsComponent },
      { path: 'genome/:id', component: GenomeComponent },
      { path: 'config', component: ConfigurationComponent },
      { path: 'assurance', component: BusinessAssuranceGapsComponent },
      { path: 'assurance/coverage', component: AssuranceComponent },
      { path: 'suite-prediction', component: SuitePredictionComponent },
      { path: 'agentic', component: AgenticComponent },
    ],
  },
  // Maestro — on-demand cloud test runs (intentionally NOT linked from the home page)
  {
    path: 'maestro',
    component: MaestroShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', component: MaestroHomeComponent },
      { path: 'target/:id', component: MaestroTargetComponent },
      { path: 'run/:id', component: MaestroRunComponent },
    ],
  },
  // Sample projects (not linked from the home page)
  { path: 'samples/code-lab', component: CodeLabComponent, canActivate: [authGuard] },
  { path: 'samples/visual-search', component: VisualSearchComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '' }
];
