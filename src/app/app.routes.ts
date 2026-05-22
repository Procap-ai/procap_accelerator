import { Routes } from '@angular/router';

import { HomeComponent } from './pages/home/home';
import { JobComponent } from './pages/job/job';

export const routes: Routes = [
  {
    path: '',
    component: HomeComponent
  },
  {
    path: 'job/:id',
    component: JobComponent
  },
  {
    path: '**',
    redirectTo: ''
  }
];
