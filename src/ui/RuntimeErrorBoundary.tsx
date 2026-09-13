import React, { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { failed: boolean };

export default class RuntimeErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    try { console.error('[Andrew Runtime] render failure', error, info.componentStack); } catch {}
  }
  private recover = (): void => { this.setState({ failed: false }); };
  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <main role="alert" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#090D16', color: '#F5F7FA', fontFamily: 'sans-serif' }}><section style={{ maxWidth: 420, textAlign: 'center' }}><h1>Andrew 2.0</h1><p>La interfaz encontró un error y fue protegida.</p><button type="button" onClick={this.recover}>Recuperar interfaz</button></section></main>;
  }
}
