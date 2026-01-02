import styles from "./MobileBlocker.module.css";

const MobileBlocker = () => {
  return (
    <div className={styles.blockerContainer}>
      <h1 className={styles.title}>Desktop Only</h1>
      <p className={styles.message}>
        This application is designed for desktop screens. Please visit us on a larger device.
      </p>
    </div>
  );
};

export default MobileBlocker;
