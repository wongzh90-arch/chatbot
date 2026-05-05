window.ErrorBoundary = class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return React.createElement('div', {
        className: 'flex flex-col items-center justify-center h-full bg-zinc-950 text-zinc-400 p-6'
      },
        React.createElement('div', { className: 'text-2xl mb-2' }, '⚠️'),
        React.createElement('h2', { className: 'text-lg font-bold text-red-400 mb-1' }, 'Something went wrong'),
        React.createElement('p', { className: 'text-xs mb-4 text-center max-w-md' }, this.state.error?.toString()),
        React.createElement('button', {
          onClick: () => { this.setState({ hasError: false }); window.location.reload(); },
          className: 'px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition'
        }, 'Reload page')
      );
    }
    return this.props.children;
  }
};
