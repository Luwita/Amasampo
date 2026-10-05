import { Link, Navigate, useParams } from 'react-router-dom';
import { CaseDetail } from '../components/Cases';
import { useStore } from '../context/StoreContext';

export default function CasePage() {
  const { id } = useParams();
  const { user, authReady, myShop } = useStore();
  if (!authReady) return null;
  if (!user) return <Navigate to={`/login?next=/cases/${id}`} replace />;
  return (
    <div className="container section narrow">
      <Link to={myShop ? '/seller?tab=returns' : '/account'} className="link small">
        ← Back
      </Link>
      <CaseDetail id={id} />
    </div>
  );
}
