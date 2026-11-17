# Third-party dependency license inventory

Inventory performed 2026-11-17 against the installed Python environment resolved from `requirements-dev.txt` and the frontend `package-lock.json` dependency tree. This is an automated metadata inventory, not legal advice, and does not replace preserving each package's license/notice file in source or distributed binaries.

## Python

`pip-licenses` reported 49 installed distributions in the development environment. Metadata was primarily MIT, BSD-2/3-Clause, Apache-2.0, PSF-2.0 and MPL-2.0. No GPL/AGPL/LGPL package was reported in that environment. The environment contains tooling and transitive dependencies; it is not an exact separately generated production SBOM.

## Frontend

`license-checker` reported 458 package records from the installed frontend dependency tree (including transitive and platform-optional packages). Most were MIT, ISC, BSD-2/3-Clause, or Apache-2.0. Metadata included multiple non-standard, dual, content, and ethical-use terms requiring attention:

- `@img/sharp-libvips-linux-x64` and `@img/sharp-libvips-linuxmusl-x64`: LGPL-3.0-or-later (optional native image-processing dependency); comply with LGPL distribution/source/relinking requirements if the binary is shipped.
- `@react-leaflet/core` and `react-leaflet`: Hippocratic-2.1 metadata; confirm package version/license applicability and policy compatibility before redistribution.
- ArcGIS packages (`@arcgis/core`, `@arcgis/lumina`, `@arcgis/toolkit`, `@esri/calcite-ui-icons`) report custom Esri developer terms. Review the applicable terms if those packages are included in the actual product bundle.
- `@amcharts/amcharts5`: custom amCharts terms; validate whether this package is in the built production dependency graph and whether a commercial license is needed.
- `caniuse-lite` and `cartocolor`: CC-BY-4.0; preserve attribution where required.
- `colorbrewer`: Apache-Style metadata; verify the exact license/notice before redistribution.
- `jszip`: `(MIT OR GPL-3.0-or-later)`; select and preserve the permissive MIT option where legally appropriate.
- `sax`: BlueOak-1.0.0; retain its notice.
- `robust-predicates`: Unlicense; review jurisdiction-specific public-domain treatment if redistributing.

The checker also found ordinary permissive dual-license packages. Automated license strings can be wrong or incomplete; review package manifests and notices for any dependency actually shipped. Frontend `npm ci` reported 29 security advisories (10 moderate, 19 high); these are security findings, not license findings, and should be separately triaged with `npm audit` before production distribution.

## Repository license scope

The root MIT `LICENSE` applies to repository-authored code only. It does not relicense dependencies, raster data, or other third-party assets. Before publishing a fork or container, generate a version-specific SBOM and ship required third-party notices, with particular review of LGPL native binaries and the custom/ethical terms listed above.
