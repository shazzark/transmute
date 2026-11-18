# Transmute website

This is a static, dependency-free landing page. Preview it from the repository root with:

```powershell
python -m http.server 4173 --directory website
```

Then open <http://localhost:4173>. The page uses locally stored Samsung A13 verification media in `images/`. The Android beta download is marked as coming soon until a verified release asset is available; GitHub source links remain available.

## Deploy with Vercel

Deploy `website/` as a static site in Vercel, reusing the Transmute project if one exists. Set Root Directory to `website`, Framework Preset to `Other`, leave Build Command blank, and set Output Directory to `.`. No environment variables are required. The page currently says Android beta coming soon and links to the GitHub source; update it only after a downloadable release exists.
