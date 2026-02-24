import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';

interface EntityContextType {
  activeEntityId: Id<'entities'> | null;
  setActiveEntityId: (id: Id<'entities'>) => void;
}

const EntityContext = createContext<EntityContextType>({
  activeEntityId: null,
  setActiveEntityId: () => {},
});

export function EntityProvider({ children }: { children: ReactNode }) {
  const [activeEntityId, setActiveEntityId] = useState<Id<'entities'> | null>(null);
  const entities = useQuery(api.entityCrud.list);

  // Initialise to the user's default entity when entities first load
  useEffect(() => {
    if (entities && entities.length > 0 && !activeEntityId) {
      const defaultEntity = entities.find((e) => e.isDefault) ?? entities[0];
      setActiveEntityId(defaultEntity._id);
    }
  }, [entities, activeEntityId]);

  return (
    <EntityContext.Provider value={{ activeEntityId, setActiveEntityId }}>
      {children}
    </EntityContext.Provider>
  );
}

export const useEntity = () => useContext(EntityContext);
