import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

export function ScrollToTop() {
  const [location] = useLocation();
  const prevLocationRef = useRef(location);

  useEffect(() => {
    // 只在路由實際變化時才滾動到頂部
    if (prevLocationRef.current !== location) {
      prevLocationRef.current = location;
      window.scrollTo(0, 0);
    }
  }, [location]);

  return null;
}
