/* eslint-disable jsx-a11y/img-redundant-alt */
import React, { useEffect, useState } from "react";

const DocumentPreview = ({ data, extractionKey }) => {
  const [images, setImages] = useState({
    cin_recto: null,
    cin_verso: null,
    photo: null,
    photo_portrait: null,
    mrz_image: null,
  });

  useEffect(() => {
    // Fonction pour construire l'URL complète avec cache-busting
    const getImageUrl = (path) => {
      if (!path || path === "N/A") return null;
      const baseUrl = `http://localhost:8000${
        path.startsWith("/") ? path : `/${path}`
      }`;
      return `${baseUrl}?t=${extractionKey}`; // Ajout du paramètre de cache
    };

    setImages({
      cin_recto: getImageUrl(data?.cin_recto),
      cin_verso: getImageUrl(data?.cin_verso),
      photo: getImageUrl(data?.photo),
      photo_portrait: getImageUrl(data?.photo_portrait),
      mrz_image: getImageUrl(data?.mrz_image),
      signature: getImageUrl(data?.signature),
    });
  }, [data, extractionKey]);

  if (!data) return null;

  return (
    <div className="document-preview">
      <h3>Images extraites</h3>
      <div className="preview-grid">
        {images.cin_recto && (
          <div className="preview-item" key={`recto-${extractionKey}`}>
            <h4>Recto</h4>
            <img
              src={images.cin_recto}
              alt="Recto du document"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "/placeholder-image.png";
              }}
              key={`recto-img-${extractionKey}`}
            />
          </div>
        )}

        {images.cin_verso && (
          <div className="preview-item" key={`verso-${extractionKey}`}>
            <h4>Verso</h4>
            <img
              src={images.cin_verso}
              alt="Verso du document"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "/placeholder-image.png";
              }}
              key={`verso-img-${extractionKey}`}
            />
          </div>
        )}

        {images.photo && (
          <div className="preview-item" key={`photo-${extractionKey}`}>
            <h4>Photo</h4>
            <img
              src={images.photo}
              alt="Photo extraite"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "/placeholder-image.png";
              }}
              key={`photo-img-${extractionKey}`}
            />
          </div>
        )}

        {images.photo_portrait && (
          <div className="preview-item" key={`portrait-${extractionKey}`}>
            <h4>Photo portrait</h4>
            <img
              src={images.photo_portrait}
              alt="Photo portrait extraite"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "/placeholder-image.png";
              }}
              key={`portrait-img-${extractionKey}`}
            />
          </div>
        )}

        {images.mrz_image && (
          <div className="preview-item" key={`mrz-${extractionKey}`}>
            <h4>Zone MRZ</h4>
            <img
              src={images.mrz_image}
              alt="Zone MRZ"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "/placeholder-image.png";
              }}
              key={`mrz-img-${extractionKey}`}
            />
          </div>
        )}

        {images.signature && (
          <div className="preview-item" key={`mrz-${extractionKey}`}>
            <h4>Signature</h4>
            <img
              src={images.signature}
              alt="Zone MRZ"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "/placeholder-image.png";
              }}
              key={`mrz-img-${extractionKey}`}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentPreview;
