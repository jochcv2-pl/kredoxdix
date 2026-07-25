'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  viewName?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * ViewErrorBoundary — isole chaque vue du CRM.
 * Si une vue crash (TypeError, undefined, etc.), seule cette vue affiche
 * l'erreur. La sidebar, la topbar et la navigation restent fonctionnelles.
 */
export class ViewErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ViewErrorBoundary${this.props.viewName ? `: ${this.props.viewName}` : ''}]`, error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 400,
          padding: 40,
          textAlign: 'center',
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'rgba(239,68,68,0.1)', color: '#dc2626',
            display: 'grid', placeItems: 'center', fontSize: 22, marginBottom: 16,
          }}>
            ⚠
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
            Cette page a rencontré une erreur
          </h3>
          <p style={{ fontSize: 13, color: '#64748b', maxWidth: 420, marginBottom: 4 }}>
            {this.props.viewName ? <><strong>{this.props.viewName}</strong> — </> : null}
            Une erreur inattendue s'est produite lors du chargement.
          </p>
          {this.state.error?.message && (
            <code style={{
              fontSize: 11, color: '#dc2626', background: 'rgba(239,68,68,0.05)',
              padding: '6px 10px', borderRadius: 6, marginTop: 8, maxWidth: 500,
              overflow: 'auto', whiteSpace: 'pre-wrap',
            }}>
              {this.state.error.message}
            </code>
          )}
          <button
            className="btn btn-primary"
            style={{ marginTop: 16 }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Réessayer
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
