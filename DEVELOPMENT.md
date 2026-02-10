# Buzz* Development

This project uses esbuild to bundle the extension and create a zip file for distribution.

To build the extension, run:

```bash
npm run build
```

To build the extension for production (which creates a zip file for distribution), run:

```bash
npm run build:prod
```

The built extension will be in the `buzz-star` directory, this can then be loaded as an unpacked extension in Chrome.
Reset the "permissions" in the extension "site settings" in order to test the microphone access popup.

For testing the API an `api-example` directory is provided, you need to set the `Allow API From` option in the extension settings to `.*\/buzz-star\/api-example\/index.html` which will allow the API from the index page.
