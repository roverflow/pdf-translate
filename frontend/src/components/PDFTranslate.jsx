import { useState, useEffect } from "react";
// import axios from "axios";
import { Document, Page } from "react-pdf";
import { pdfjs } from "react-pdf";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const TranslationAndViewPDF = () => {
  const [file, setFile] = useState(null);
  const [langIn, setLangIn] = useState("en");
  const [langOut, setLangOut] = useState("kn");
  const [loading, setLoading] = useState(false);
  const [taskId, setTaskId] = useState(null);
  const [error, setError] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [polling, setPolling] = useState(false);
  const [secondPdf, setSecondPdf] = useState(null);

  // handle page number
  const handlePageChange = (offset = 1, increase = true) => {
    setPageNumber((prevPageNumber) => {
      if (increase) {
        return prevPageNumber + offset;
      } else {
        return prevPageNumber - offset;
      }
    });
  };

  // Handle file change
  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
  };

  // Handle form submit
  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!file) {
      setError("Please select a PDF file");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append(
      "data",
      JSON.stringify({
        lang_in: langIn,
        lang_out: langOut,
        service: "google",
        thread: 4,
      })
    );
    console.log(formData);

    setLoading(true);
    setError(null);

    const requestOptions = {
      method: "POST",
      body: formData,
      redirect: "follow",
    };

    fetch("http://127.0.0.1:8004/v1/translate", requestOptions)
      .then(async (resp) => {
        if (!resp.ok) {
          throw new Error("Error during translation");
        }
        const data = await resp.json();
        console.log(data);
        const { id } = data;
        setTaskId(id);
        setPolling(true);
      })
      .catch((error) => {
        setError("Error during translation");
        console.error(error);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    let interval;
    if (polling) {
      interval = setInterval(() => {
        fetch(`http://127.0.0.1:8004/v1/translate/${taskId}`)
          .then(async (resp) => {
            if (!resp.ok) {
              throw new Error("Error fetching status");
            }
            const data = await resp.json();
            const { ready } = data;
            if (ready) {
              setPolling(false);
              setLoading(false);
              setSecondPdf(
                `http://127.0.0.1:8004/download/${
                  file.name.split(".")[0]
                }?lang_out=${langOut}`
              );
            }
          })
          .catch((error) => {
            setError("Error fetching status");
            console.error(error);
          });
      }, 5000); // Poll every 5 seconds
    }
    return () => clearInterval(interval);
  }, [polling, taskId]);

  return (
    <>
      <div className="flex flex-col justify-center p-4 gap-2">
        <h1 className="text-2xl font-bold">Translate PDF</h1>

        <div className="border w-full rounded-xl p-4">
          <form onSubmit={handleSubmit} className="flex gap-4">
            <label>
              Select PDF File:
              <input
                type="file"
                className="px-2 border"
                accept="application/pdf"
                onChange={handleFileChange}
              />
            </label>

            <div>
              <label>
                From Language:
                <input
                  type="text"
                  className="border px-1 mx-1"
                  value={langIn}
                  onChange={(e) => setLangIn(e.target.value)}
                  placeholder="e.g., en"
                />
              </label>
            </div>

            <div>
              <label>
                To Language:
                <input
                  type="text"
                  className="border px-1 mx-1"
                  value={langOut}
                  onChange={(e) => setLangOut(e.target.value)}
                  placeholder="e.g., kn"
                />
              </label>
            </div>

            <button type="submit" className="border" disabled={loading}>
              {loading ? "Translating..." : "Start Translation"}
            </button>
          </form>
          {taskId && <div>Task ID: {taskId}</div>}
        </div>
      </div>
      {loading && <div className="text-blue-500">Loading...</div>}
      {error && <div className="text-red-500">{error}</div>}

      {file && (
        <>
          <button
            onClick={() => handlePageChange(1, true)}
            className="border px-2"
          >
            Next Page
          </button>
          <button
            onClick={() => handlePageChange(1, false)}
            className="border px-2"
          >
            Prev Page
          </button>
        </>
      )}

      <div className="flex p-4 gap-4">
        <div className="w-1/2 border flex flex-col items-center justify-center gap-2">
          <h1 className="border w-full">Original</h1>
          {file && (
            <Document file={file} className="border">
              <Page pageNumber={pageNumber} />
            </Document>
          )}
        </div>
        <div className="w-1/2 border flex flex-col items-center justify-center gap-2">
          <h1 className="border w-full">Translated</h1>
          {loading && <div className="text-blue-500">Loading...</div>}
          {secondPdf && (
            <Document file={secondPdf} className="border">
              <Page pageNumber={pageNumber} />
            </Document>
          )}
        </div>
      </div>
    </>
  );
};

export default TranslationAndViewPDF;
