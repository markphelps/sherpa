import { Component, type ComponentChildren } from "preact";
import { ErrorState } from "./ErrorState";

interface Props {
  children: ComponentChildren;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Sherpa error boundary caught:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorState
          category="unknown"
          message={this.state.error.message}
          onAction={() => this.setState({ error: null })}
          onSettingsClick={() => {}}
        />
      );
    }

    return this.props.children;
  }
}
