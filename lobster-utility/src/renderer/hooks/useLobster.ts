import { useState, useEffect, useCallback } from 'react';

// Generic hook for IPC data with auto-refresh
export function useLobsterData<T>(
  fetcher: () => Promise<T>,
  subscriber?: (callback: (data: T) => void) => () => void,
  deps: any[] = []
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const result = await fetcher();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore sconosciuto');
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    refresh();
    if (subscriber) {
      const unsubscribe = subscriber((newData) => setData(newData));
      return unsubscribe;
    }
  }, [refresh]);

  return { data, loading, error, refresh };
}

// Specific hooks
export function useProjects() {
  return useLobsterData(
    () => window.lobster.projects.getAll(),
    (cb) => window.lobster.projects.onUpdates(cb)
  );
}

export function usePorts() {
  return useLobsterData(
    () => window.lobster.ports.getAll(),
    (cb) => window.lobster.ports.onChanges(cb)
  );
}

export function useDocker() {
  // IMPORTANTE: onEvents manda DockerContainer[] ma noi vogliamo DockerComposeProject[].
  // Usiamo l'evento SOLO come trigger per ri-fetchare i dati nel formato corretto.
  const hook = useLobsterData(
    () => window.lobster.docker.getComposeProjects(),
  );

  useEffect(() => {
    const unsubscribe = window.lobster.docker.onEvents(() => {
      // Ri-fetch compose projects quando Docker cambia stato
      hook.refresh();
    });
    return unsubscribe;
  }, [hook.refresh]);

  return hook;
}

export function useDockerContainers() {
  const hook = useLobsterData(
    () => window.lobster.docker.getContainers(),
  );

  useEffect(() => {
    const unsubscribe = window.lobster.docker.onEvents(() => {
      hook.refresh();
    });
    return unsubscribe;
  }, [hook.refresh]);

  return hook;
}

export function useNotifications() {
  return useLobsterData(
    () => window.lobster.notifications.getAll(),
    (cb) => window.lobster.notifications.onNew(cb)
  );
}

export function useResources() {
  return useLobsterData(
    () => window.lobster.resources.get(),
    (cb) => window.lobster.resources.onUpdates(cb)
  );
}
