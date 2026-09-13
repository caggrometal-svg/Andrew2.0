import React, { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { failed: boolean };

export default class RuntimeErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    try {
      console.error('[Andrew Runtime] render failure', error, info.componentStack);
    } catch {
      // Never allow diagnostics to break recovery.
    }
  }

  private recover = (): void => {
    this.setState({ failed: false });
  };

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <main
        role="alert"
        style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#090D16', color: '#F5F7FA', fontFamily: 'sans-serif' }}
      >
        <section style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ marginBottom: 8 }}>Andrew 2.0</h1>
          <p style={{ opacity: 0.8 }}>La interfaz encontró un error y fue protegida.</p>
          <button type="button" onClick={this.recover} style={{ marginTop: 16, padding: '12px 18px', borderRadius: 10, border: 0, cursor: 'pointer' }}>
            Recuperar interfaz
          </button>
        </section>
      </main>
    );
  }
}
