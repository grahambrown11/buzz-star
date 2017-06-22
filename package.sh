#!/bin/bash
npm install
gulp prod
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --pack-extension=chrome-phone --pack-extension-key=chrome-phone.pem
