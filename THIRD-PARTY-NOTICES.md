# Third-party software

Flashborn uses Electron and its Chromium browser engine. Electron's license
and Chromium's third-party license notices are included in the installed app
as LICENSE.electron.txt and LICENSES.chromium.html.

Flash playback uses Ruffle 0.7.1, Copyright Ruffle contributors, distributed
under the MIT and Apache 2.0 licenses. Both license texts are included in
resources/ruffle and resources/flash-extension/dist. Ruffle's release source
is available at https://github.com/ruffle-rs/ruffle/tree/v0.7.1.

The bundled Ruffle extension is adapted for Electron: sync storage uses
local storage, scripts are statically registered, and unsupported extension
service-worker and declarative-network features are omitted. SWF navigation
is handled by Flashborn. These changes do not modify Ruffle's Flash engine.

Adobe Flash Player is not included. Flashborn is not affiliated with Adobe,
OpenAI, Google, Electron, or the Ruffle project.
