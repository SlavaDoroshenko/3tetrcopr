import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Container,
  Paper,
  Typography,
  Box,
  CircularProgress,
} from "@mui/material";

function App() {
  const [stats, setStats] = useState(null);
  const [requestHistory, setRequestHistory] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const response = await axios.get("http://localhost:5000/");
      setStats(response.data);

      // Обновляем историю запросов
      setRequestHistory((prevHistory) => {
        const history = [...prevHistory];
        history.push({
          time: new Date().toLocaleTimeString(),
          requests: response.data.TotalRequests,
          getRequests: response.data.GetRequests,
          postRequests: response.data.PostRequests,
        });

        // Оставляем только последние 10 записей
        if (history.length > 10) {
          history.shift();
        }

        return history;
      });
      setError(null);
    } catch (error) {
      console.error("Ошибка при получении данных:", error);
      setError("Ошибка при получении данных с сервера");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Получаем данные каждую секунду
    const interval = setInterval(fetchData, 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <Container
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <CircularProgress />
      </Container>
    );
  }

  if (error) {
    return (
      <Container
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <Typography color="error">{error}</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Мониторинг HTTP-сервера
      </Typography>

      {stats && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Текущая статистика
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 2,
            }}
          >
            <Paper sx={{ p: 2, textAlign: "center" }}>
              <Typography variant="h6">{stats.TotalRequests}</Typography>
              <Typography color="text.secondary">Всего запросов</Typography>
            </Paper>
            <Paper sx={{ p: 2, textAlign: "center" }}>
              <Typography variant="h6">{stats.GetRequests}</Typography>
              <Typography color="text.secondary">GET запросов</Typography>
            </Paper>
            <Paper sx={{ p: 2, textAlign: "center" }}>
              <Typography variant="h6">{stats.PostRequests}</Typography>
              <Typography color="text.secondary">POST запросов</Typography>
            </Paper>
            <Paper sx={{ p: 2, textAlign: "center" }}>
              <Typography variant="h6">
                {Math.floor(stats.Uptime.TotalSeconds)}
              </Typography>
              <Typography color="text.secondary">Время работы (сек)</Typography>
            </Paper>
          </Box>
        </Paper>
      )}

      <Paper sx={{ p: 3, height: 400 }}>
        <Typography variant="h6" gutterBottom>
          График запросов
        </Typography>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={requestHistory}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="requests"
              stroke="#8884d8"
              name="Всего запросов"
            />
            <Line
              type="monotone"
              dataKey="getRequests"
              stroke="#82ca9d"
              name="GET запросы"
            />
            <Line
              type="monotone"
              dataKey="postRequests"
              stroke="#ffc658"
              name="POST запросы"
            />
          </LineChart>
        </ResponsiveContainer>
      </Paper>
    </Container>
  );
}

export default App;
