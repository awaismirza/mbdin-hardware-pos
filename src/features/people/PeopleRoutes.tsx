import { Route, Routes } from 'react-router-dom';

import { CustomerDetail } from './CustomerDetail';
import { CustomerEditor } from './CustomerEditor';
import { PeopleList } from './PeopleList';


export function PeopleRoutes() {
  return (
    <Routes>
      <Route index element={<PeopleList />} />
      <Route path="customer/:id" element={<CustomerEditor />} />
      <Route path=":id" element={<CustomerDetail />} />
    </Routes>
  );
}
