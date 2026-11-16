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
import Disclaimer from './pages/Disclaimer';
import ScrollToTop from './components/ScrollToTop';
import { FocusModeProvider } from './contexts/FocusModeContext';
import { categories } from './data/tools';

export default function App() {
  return (
    <HelmetProvider>
      <FocusModeProvider>
        <Router>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Home />} />
              {categories.map((cat) => (
                <Route
                  key={cat.id}
                  path={cat.id}
                  element={<Home categoryProp={cat.id} />}
                />
              ))}
              <Route path="about" element={<About />} />
              <Route path="contact" element={<Contact />} />
              <Route path="privacy" element={<Privacy />} />
              <Route path="terms" element={<Terms />} />
              <Route path="disclaimer" element={<Disclaimer />} />
              <Route path="blog" element={<Blog />} />
              <Route path="blog/:id" element={<BlogPost />} />
              <Route path="tool/:id" element={<ToolPage />} />
              <Route path=":id" element={<ToolPage />} />
              <Route path="*" element={<ToolPage />} />
            </Route>
          </Routes>
        </Router>
      </FocusModeProvider>
    </HelmetProvider>
  );
}
