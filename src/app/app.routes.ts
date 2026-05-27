import { Routes } from '@angular/router';

import { ConvertHomeComponent } from './pages/convert-home/convert-home';
import { ConvertJobComponent } from './pages/convert-job/convert-job';
import { HomeComponent } from './pages/home/home';
import { JobComponent } from './pages/job/job';

export const routes: Routes = [
  { path: '', component: ConvertHomeComponent },
  { path: 'convert/job/:id', component: ConvertJobComponent },
  { path: 'agentic-testing', component: HomeComponent },
  { path: 'agentic-testing/job/:id', component: JobComponent },
  { path: '**', redirectTo: '' }
];
