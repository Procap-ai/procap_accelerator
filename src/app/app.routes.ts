import { Routes } from '@angular/router';

import { LandingComponent } from './pages/landing/landing';
import { PlaywrightConvertHomeComponent } from './pages/playwright-convert-home/playwright-convert-home';
import { PlaywrightConvertJobComponent } from './pages/playwright-convert-job/playwright-convert-job';
import { ConvertHomeComponent } from './pages/convert-home/convert-home';
import { ConvertJobComponent } from './pages/convert-job/convert-job';
import { CodeLabComponent } from './pages/samples/code-lab/code-lab';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'playwright-convert', component: PlaywrightConvertHomeComponent },
  { path: 'playwright-convert/job/:id', component: PlaywrightConvertJobComponent },
  { path: 'mabl-convert', component: ConvertHomeComponent },
  { path: 'mabl-convert/job/:id', component: ConvertJobComponent },
  // Sample projects (not linked from the home page)
  { path: 'samples/code-lab', component: CodeLabComponent },
  { path: '**', redirectTo: '' }
];
