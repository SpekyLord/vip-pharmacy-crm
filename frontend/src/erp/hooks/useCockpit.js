import useErpApi from './useErpApi';

/**
 * useCockpit — Phase EC-1.
 *
 * Fetcher for the Executive Cockpit page. Single endpoint,
 * scope flags resolved server-side based on the user's lookup-driven roles.
 */
export default function useCockpit() {
  const api = useErpApi();
  const getCockpit = () => api.get('/cockpit');
  return { ...api, getCockpit };
}
