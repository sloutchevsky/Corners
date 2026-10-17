# Microsoft signing registration

Status: setup prepared; Microsoft account sign-in and identity validation remain
with the publisher. No signing resource, subscription, or paid service has been
created by this setup. Existing v1.8.5 release files are still unsigned.

## Registration

1. Sign in at <https://portal.azure.com/>. Create a Microsoft account if needed.
   Complete authentication yourself; keep passwords and identity documents out
   of chat and the repository.
2. Use a paid Azure subscription, such as **Pay-As-You-Go**. Microsoft's
   [FAQ](https://learn.microsoft.com/en-us/azure/artifact-signing/faq) says free,
   trial, and sponsored subscriptions cannot use Artifact Signing.
   For individual Public Trust verification, the
   billing account must be **Individual**, with legal name and sold-to address
   matching government-issued ID. Individuals must be in the US or Canada.
   Organizations have a separate validation route and geographic eligibility.
3. Register the subscription's `Microsoft.CodeSigning` resource provider.
4. Create an **Artifact Signing account**. Proposed resource group:
   `flashborn-signing`; account: `flashborn-signing` if available; region:
   **East US**; tier: **Basic**. Review the actual charge before creation.
   Microsoft lists signing from US$9.99/month. Billing starts when the signing
   account is created, including while validation is pending; monthly pricing
   is not prorated. The portal's quote governs.
5. Under **Identity validations**, start **Individual Developer / Public** (or
   the appropriate organization route). Complete Microsoft's identity check.
6. Once approved, create a **Public Trust** certificate profile, proposed name
   `flashborn-public`. Private Trust and Public Trust Test profiles do not supply
   a publicly trusted signature. Record the exact verified publisher name and
   the account endpoint.
7. Configure build authentication with access scoped to the certificate profile
   and the **Artifact Signing Certificate Profile Signer** role. The installed
   electron-builder v26 uses the PowerShell TrustedSigning integration; its
   documented service-principal route uses `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
   and `AZURE_CLIENT_SECRET`. Create/grant credentials only with the publisher's
   approval. Store credentials outside Git, logs, and chat. No Azure username or
   password belongs in build configuration.

## Build after approval

Set these non-secret environment values from the approved Microsoft resource:

```powershell
$env:FLASHBORN_SIGNING_ENDPOINT = 'https://eus.codesigning.azure.net'
$env:FLASHBORN_SIGNING_ACCOUNT = 'your-actual-account-name'
$env:FLASHBORN_SIGNING_PROFILE = 'your-public-trust-profile'
$env:FLASHBORN_SIGNING_PUBLISHER = 'exact verified certificate name'
npm run dist:azure
```

The separate Azure configuration preserves the current packaging options,
requires signing, timestamps SHA-256 signatures, and never publishes
automatically. Missing configuration or signing errors stop the command. The
final verification requires valid, timestamped signatures under the expected
publisher for the app, the separate Flash runtime executable, and the installer.
electron-builder also signs the generated NSIS uninstaller. Inspect the installed
uninstaller's signature before publishing the first signed release.

Adobe's original Flash DLL keeps its existing Adobe signature and pinned bytes;
do not replace that signature with the Flashborn publisher's identity. Run the
existing package/provenance checks and application checks before publishing a
new signed release. Signature verification and an Azure account are not proof
that Microsoft has accepted the app into the Store or granted SmartScreen
reputation. A newly signed GitHub download may still warn until reputation grows.

Sources:

- [Microsoft Artifact Signing quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)
- [Microsoft pricing and billing](https://azure.microsoft.com/en-us/pricing/details/artifact-signing/)
- [Microsoft SmartScreen reputation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)
- [electron-builder v26 Azure integration](https://www.electron.build/v26/docs/features/code-signing/code-signing-win/)
