# QRDX Explorer

A blockchain explorer for the QRDX (Quantum Resistant Decentralized eXchange) network. Built with Next.js, React, TypeScript, and Tailwind CSS, using components from the QRDX ecosystem.

## Features

- 🔍 Search blocks, transactions, addresses, and smart contracts
- 📊 Real-time network statistics
- 🌙 Dark/Light theme support
- 📱 Responsive design
- ⚡ Built with Next.js 16 and React 19
- 🎨 Styled with Tailwind CSS and shadcn/ui components

## Project Structure

This project uses components from:
- **qrdx-website**: Navigation, Footer, and UI components
- **qrdx-trade**: Trading interface patterns and layouts

Both are included as git submodules in the `submodules/` directory.

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- pnpm (recommended) or npm

### Installation

1. Clone the repository with submodules:
```bash
git clone --recursive https://github.com/qrdx-org/qrdx-explorer.git
cd qrdx-explorer
```

Or if already cloned, initialize submodules:
```bash
git submodule update --init --recursive
```

2. Install dependencies:
```bash
pnpm install
# or
npm install
```

3. Run the development server:
```bash
pnpm dev
# or
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) with your browser.

## Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm clean` - Clean build artifacts

## Submodules

This project includes the following git submodules:

- `submodules/qrdx-website` - Main QRDX website components
- `submodules/qrdx-trade` - QRDX trading platform components

To update submodules:
```bash
git submodule update --remote
```

## Tech Stack

- **Framework**: Next.js 16
- **UI Library**: React 19
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui
- **Icons**: Lucide React
- **Theme**: next-themes
- **Language**: TypeScript

## License

ISC License - see LICENSE file for details

## QRDX Ecosystem

- [Main Website](https://qrdx.org)
- [Trading Platform](https://trade.qrdx.org)
- [Documentation](https://docs.qrdx.org)
- [GitHub](https://github.com/qrdx-org)
