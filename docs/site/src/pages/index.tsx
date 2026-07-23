import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

export default function Home(): ReactNode {
  return (
    <Layout
      title="SAPOT Documentation"
      description="LAN-first disaster-response communications platform documentation">
      <main style={{padding: '3rem 2rem', maxWidth: 960, margin: '0 auto'}}>
        <Heading as="h1">SAPOT Documentation</Heading>
        <p>
          SAPOT is a LAN-first disaster-response communications platform:
          messaging, voice/video calls, GPS tracking, and announcements over
          a local-area network when internet connectivity is unavailable.
        </p>
        <div style={{display: 'flex', gap: '1.5rem', marginTop: '2rem', flexWrap: 'wrap'}}>
          <Link
            className="button button--primary button--lg"
            to="/docs/getting-started/overview">
            Platform Docs
          </Link>
          <Link
            className="button button--secondary button--lg"
            to="/mobile-docs/ONBOARDING">
            Mobile App Docs
          </Link>
        </div>
      </main>
    </Layout>
  );
}
