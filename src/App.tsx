import { Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import Dashboard from "@/routes/Dashboard";
import LogSpend from "@/routes/LogSpend";
import AskJarvis from "@/routes/AskJarvis";
import Charts from "@/routes/Charts";
import YearlyView from "@/routes/YearlyView";
import CalendarView from "@/routes/CalendarView";
import Savings from "@/routes/Savings";
import Afterpay from "@/routes/Afterpay";
import WishList from "@/routes/WishList";

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/log" element={<LogSpend />} />
        <Route path="/jarvis" element={<AskJarvis />} />
        <Route path="/charts" element={<Charts />} />
        <Route path="/yearly" element={<YearlyView />} />
        <Route path="/calendar" element={<CalendarView />} />
        <Route path="/savings" element={<Savings />} />
        <Route path="/afterpay" element={<Afterpay />} />
        <Route path="/wishlist" element={<WishList />} />
      </Routes>
    </AppShell>
  );
}
