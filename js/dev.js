// Developer tools on or off: on while building; off in a release build (tools/build.mjs --release sets
// window.__SVGP_RELEASE) or with ?release on the URL. main.js hides the Development menu and the test items with it.
export const DEV = !window.__SVGP_RELEASE && !new URLSearchParams(location.search).has('release');
