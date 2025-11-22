# ZDR (Zero Data Retention) Module

This module implements policies and checks for **Zero Data Retention** compliance.

## Purpose

In certain enterprise or privacy-focused environments, it is critical to ensure that data sent to LLM providers is not retained by the provider for model training or other purposes. This module provides:

1.  **Filtering**: Mechanisms to filter available models to only those that support ZDR.
2.  **Enforcement**: Runtime checks to prevent sending messages to non-compliant models if ZDR mode is strictly enforced.
3.  **Caching**: Efficient caching of ZDR compliance status for models and providers to avoid excessive network calls.

## Key Concepts

-   **ZDR Only Mode**: A user preference or system policy that strictly forbids non-ZDR models.
-   **ZDR List**: A list of models and providers known to support ZDR. This is typically fetched from a remote configuration or API.
-   **Enforcement**: If ZDR mode is on, the application will block requests to models not on the allowlist and display a notice to the user.

## Structure

-   `enforce.ts`: Core logic for checking model compliance against the lists.
-   `cache.ts`: Manages the caching of the ZDR allowlists in the application state/store.
-   `types.ts`: TypeScript definitions for ZDR structures.
-   `constants.ts`: Configuration constants (e.g., cache TTL).
