# Transmute website

This is a static, dependency-free landing page. Preview it from the repository root with:

```powershell
python -m http.server 4173 --directory website
```

Then open <http://localhost:4173>. The page uses one locally stored Samsung A13 screenshot in `images/`; the beta download stays unavailable until a signed APK release URL is verified.

## Publish with GitHub Pages

The workflow in `.github/workflows/pages.yml` deploys the `website/` directory when its files change on `main` and can also be run manually. After merging/pushing the website commit, open **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**, then monitor **Actions → Deploy Transmute website**. The workflow reports the resulting URL. This repository change itself does not publish the site.

After an Android release is created, replace the availability messages in `index.html` with the verified release APK URL and update the release-notes reference. Commit and push that website update to redeploy. Share the Pages URL shown in the workflow run with testers.
