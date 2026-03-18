import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import Layout from './components/Layout';
import Home from './pages/Home';
import ToolPage from './pages/ToolPage';
import About from './pages/About';
import Contact from './pages/Contact';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Blog from './pages/Blog';
import BlogPost from './pages/BlogPost';
import ScrollToTop from './components/ScrollToTop';
import { FocusModeProvider } from './contexts/FocusModeContext';

export default function App() {
  return (
    <HelmetProvider>
      <FocusModeProvider>
        <Router>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="about" element={<About />} />
              <Route path="contact" element={<Contact />} />
              <Route path="privacy" element={<Privacy />} />
              <Route path="terms" element={<Terms />} />
              <Route path="blog" element={<Blog />} />
              <Route path="blog/:id" element={<BlogPost />} />
              <Route path=":id" element={<ToolPage />} />
              <Route path="tool/:id" element={<ToolPage />} />
            </Route>
          </Routes>
        </Router>
      </FocusModeProvider>
    </HelmetProvider>
  );
}
