import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CodeAnalyzer from '../components/CodeAnalyzer';
import api from '../services/api';
import { Loader2 } from 'lucide-react';

/**
 * CodeAnalyzerPage – captures file path from the wildcard route segment,
 * fetches file list from the analysis graph, loads selected file content,
 * and renders the full CodeAnalyzer UI.
 */
const CodeAnalyzerPage = () => {
  const { id: analysisId, '*': rest } = useParams();
  const filePath = decodeURIComponent(rest || '');
  const navigate = useNavigate();

  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(filePath || '');
  const [fileContent, setFileContent] = useState('');
  const [loading, setLoading] = useState(true);

  // Load repository file list on mount
  useEffect(() => {
    const fetchRepoData = async () => {
      try {
        const res = await api.get(`/analysis/graph/${analysisId}`);
        const fileNodes = res.data.nodes
          .filter(n => n.loc > 0)
          .map(n => n.id)
          .sort();
        setFiles(fileNodes);

        // If no file specified in URL, select the first available file
        if (!filePath && fileNodes.length > 0) {
          setSelectedFile(fileNodes[0]);
        }
      } catch (err) {
        console.error('Failed to load repo layout', err);
      }
    };
    fetchRepoData();
  }, [analysisId, filePath]);

  // Load selected file content whenever selection changes
  useEffect(() => {
    if (!selectedFile) return;
    setLoading(true);
    const fetchContent = async () => {
      try {
        const res = await api.get(`/analysis/${analysisId}/file`, {
          params: { path: selectedFile }
        });
        setFileContent(res.data.content);
      } catch (e) {
        console.error(e);
        // Fallback: try the editor suggest endpoint for backwards compatibility
        try {
          const fallback = await api.post('/editor/suggest', {
            analysisId,
            filePath: selectedFile,
            prompt: 'Retrieve full file content'
          });
          setFileContent(fallback.data.originalContent || '');
        } catch (e2) {
          console.error('Fallback also failed', e2);
          setFileContent('// Error loading file content');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchContent();
  }, [selectedFile, analysisId]);

  // Update URL when user picks a different file from the sidebar
  const handleFileSelect = (file) => {
    setSelectedFile(file);
    navigate(`/analysis/${analysisId}/code/${encodeURIComponent(file)}`, { replace: true });
  };

  if (loading && !fileContent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030303]">
        <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <CodeAnalyzer
      analysisId={analysisId}
      filePath={selectedFile}
      fileContent={fileContent}
      files={files}
      onFileSelect={handleFileSelect}
    />
  );
};

export default CodeAnalyzerPage;
