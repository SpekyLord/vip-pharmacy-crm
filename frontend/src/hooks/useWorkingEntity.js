import { useContext } from 'react';
import { EntityContext } from '../context/EntityContextObject';

export default function useWorkingEntity() {
  const context = useContext(EntityContext);
  if (!context) throw new Error('useWorkingEntity must be used within EntityProvider');
  return context;
}
