import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <Link className="footer-brand" to="/">SCION.</Link>
        <p>Independent voices. Lasting perspectives.</p>
        <a href="/#discover">Explore the journal <span aria-hidden="true">↗</span></a>
      </div>
    </footer>
  );
}
