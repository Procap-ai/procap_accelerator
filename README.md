# ProCap Accelerator

ProCap Accelerator is a premium Angular 20 frontend for the ProCap AI QA workflow. It accepts a website URL, GitHub repository, or Selenium ZIP archive, then tracks an AI job that produces page analysis, Playwright tests, and a mabl automation script.

## Stack

- Angular 20 standalone components
- SCSS design system inspired by ProCap AI
- Hash-based routing for GitHub Pages
- HttpClient integration with `https://api.lokaai.in/procap/*`

## Local development

```bash
npm install
npm start
```

Open `http://localhost:4200/#/`.

## Production build

```bash
npm run build
```

Angular emits the production bundle to `dist/procap-accelerator/browser/`.

## Deployment

- GitHub Pages custom domain: `app.procap.ai`
- GitHub Actions workflow: `.github/workflows/deploy.yml`
- The repository root also keeps the latest built assets for immediate Pages serving from `main`.
