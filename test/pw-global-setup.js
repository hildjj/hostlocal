import fs from 'node:fs/promises';

/**
 * Playwright global setup.  Create Firefox policy file.
 */
export default async function globalSetup() {
  const ffxPolicies = {
    policies: {
      Certificates: {
        Install: [process.env.HOSTLOCAL_TEMP_CA_FILE],
      },
    },
  };
  await fs.writeFile(
    process.env.PLAYWRIGHT_FIREFOX_POLICIES_JSON,
    JSON.stringify(ffxPolicies, null, 2)
  );
}
