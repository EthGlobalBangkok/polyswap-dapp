'use client';

import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';
import styles from './page.module.css';

const SwaggerUI = dynamic(() => import('swagger-ui-react'), { 
  ssr: false,
  loading: () => <div className={styles.loading}>Loading API documentation...</div>
});

export default function ApiDocsPage() {
  return (
    <div className={styles.container}>
      <SwaggerUI url="/api/swagger" />
    </div>
  );
}

