import { Component, type ErrorInfo, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught application error', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: '1.5rem',
            background: '#0b1222',
            color: '#f8fbff',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <section
            style={{
              width: 'min(560px, 100%)',
              border: '1px solid rgba(130, 148, 185, 0.25)',
              borderRadius: '16px',
              padding: '1.25rem',
              background: 'rgba(255, 255, 255, 0.04)',
            }}
          >
            <h1 style={{ marginTop: 0 }}>Something went wrong</h1>
            <p>
              The dashboard hit an unexpected error. Refresh to continue. If the issue persists,
              export your backup once recovered and report the steps that triggered the problem.
            </p>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
