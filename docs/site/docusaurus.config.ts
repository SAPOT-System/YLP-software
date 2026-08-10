import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'SAPOT Documentation',
  tagline: 'LAN-first disaster-response communications platform',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://sapot-system.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/YLP-software/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'SAPOT-System', // Usually your GitHub org/user name.
  projectName: 'YLP-software', // Usually your repo name.

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  markdown: {
    format: 'md',
    mermaid: true,
  },

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          path: '..',
          routeBasePath: 'docs',
          exclude: ['site/**'],
          sidebarPath: './sidebars.ts',
          editUrl:
            'https://github.com/SAPOT-System/YLP-software/edit/develop/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'mobile',
        path: '../../mobile-app/sapot-mobile-app/docs',
        routeBasePath: 'mobile-docs',
        sidebarPath: './sidebarsMobile.ts',
        editUrl:
          'https://github.com/SAPOT-System/YLP-software/edit/develop/mobile-app/sapot-mobile-app/docs/',
      },
    ],
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        indexDocs: true,
        indexPages: false,
        docsRouteBasePath: ['/docs', '/mobile-docs'],
      },
    ],
  ],

  themes: ['@docusaurus/theme-mermaid'],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'SAPOT Docs',
      logo: {
        alt: 'SAPOT Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          to: '/docs/getting-started/overview',
          label: 'Platform Docs',
          position: 'left',
        },
        {
          to: '/mobile-docs/ONBOARDING',
          label: 'Mobile App Docs',
          position: 'left',
        },
        {
          href: 'https://github.com/SAPOT-System/YLP-software',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Platform Docs',
              to: '/docs/getting-started/overview',
            },
            {
              label: 'Mobile App Docs',
              to: '/mobile-docs/ONBOARDING',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/SAPOT-System/YLP-software',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} SAPOT. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
