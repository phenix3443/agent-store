# Waffo Legal Readiness Design

## Goal

Resolve the engineering-accuracy findings in the Waffo merchant review, especially the Terms of Service and Privacy Policy, and make the public site pass Waffo's discoverability checks before deploying the web application to production.

This work does not invent the operator's legal identity, governing law, business address, final refund window, or Waffo's contractual Merchant of Record responsibilities. Those remain explicit launch blockers until the operator or Waffo confirms them.

## Scope

### Public legal pages

- Publish matching Chinese and English Terms of Service.
- Publish matching Chinese and English Privacy Policy content.
- Keep the existing narrow, document-focused page layout.
- Add a compact language control that shows one language at a time and applies the correct `lang` attribute to the visible document.
- Use semantic headings, sections, lists, and working `mailto:agent-store@panghuli.tech` contact links.

The Terms must accurately describe the current Free, monthly, yearly, and lifetime products; USD pricing; tax-included checkout; optional 14-day trial; automatic renewal; cancellation timing; third-party checkout; account and service termination; and the current support-based cancellation/refund request path. Waffo is described conditionally as the intended payment provider while production merchant activation remains pending.

The Privacy Policy must disclose the actual authentication, account, review, billing, analytics, infrastructure, and local usage data found in the repository. It must name Neon, Cloudflare, Vercel, GitHub, Google, and Waffo, distinguish local data from cloud data, disclose the Neon `us-east-1` region and potential international processing, remove the unimplemented cross-device-sync claim from the policy, homepage, documentation, and login flow, and describe account/data-rights requests as a verified manual support process rather than a self-service feature.

### Site-wide discoverability

The shared public-site footer must expose visible links to `/terms` and `/privacy` plus a visible `mailto:agent-store@panghuli.tech` link. This footer content must be present on the home page and other public storefront pages so Waffo's crawler can discover it without starting from a legal page.

### Regression checks

Focused automated tests will assert:

- both languages contain the current pricing, trial, renewal, cancellation, and support facts;
- the privacy text names active processors and actual data categories;
- no cross-device-sync claim remains;
- support links use `mailto:`;
- one document language is visible at a time with correct language semantics;
- the shared footer contains Terms, Privacy, and support links.

The `waffo-merchant-onboarding` skill's legal checklist will gain a mandatory site-entry-point check: crawl the homepage and representative public pages, verify the three footer links are visible and functional, and do not infer discoverability merely because legal URLs return HTTP 200.

### Review document

`docs/WAFFO-MERCHANT-REVIEW.md` in the Obsidian workspace will be reorganized so all copy-ready Waffo form answers live in one standalone chapter. Audit findings will be updated from open findings to verified resolutions only after tests and deployed-page checks pass. Unknown legal and business facts will remain in a separate manual-confirmation section.

## Verification And Release

1. Run the focused store tests and observe the new tests fail before implementation.
2. Implement the minimum legal-page and shared-footer changes required for the tests to pass.
3. Run store tests, type checking, lint, and production build.
4. Start the web application and visually inspect desktop and mobile legal pages, language switching, footer links, long content, and print behavior against the existing design conventions.
5. Deploy the store application using the repository's existing Cloudflare production workflow.
6. Verify the deployed homepage, `/pricing`, `/terms`, and `/privacy` over HTTPS, including visible footer links, `mailto:` target, language behavior, and current legal content.
7. Update the Waffo review document with the deployment evidence and remaining blockers.

Production deployment here means publishing the corrected public web application. It does not authorize replacing test-mode Waffo credentials, creating production Waffo products, or performing a real charge.

## Out Of Scope

- Anonymous checkout account binding.
- Refund webhook entitlement revocation.
- In-product cancellation or refund UI.
- Waffo SDK upgrades.
- Production Waffo credential or product activation.
- Legal advice or jurisdiction-specific conclusions.
