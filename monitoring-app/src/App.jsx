import React, { useState, useEffect } from "react";
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
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
} from "@mui/material";

function App() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [methodFilter, setMethodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [filteredData, setFilteredData] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get("http://localhost:5000/stats");
        setStats(response.data);
        setError(null);
      } catch (error) {
        console.error("Ошибка при получении данных:", error);
        setError("Ошибка при получении данных с сервера");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (stats?.RequestHistory) {
      let filtered = stats.RequestHistory;

      // Фильтрация по методу
      if (methodFilter !== "all") {
        filtered = filtered.filter((item) => item.Method === methodFilter);
      }

      // Фильтрация по статусу
      if (statusFilter !== "all") {
        filtered = filtered.filter((item) => item.StatusCode === statusFilter);
      }

      // Группируем запросы по секундам
      const groupedBySecond = filtered.reduce((acc, item) => {
        const second = Math.floor(item.TimeFromStart);
        if (!acc[second]) {
          acc[second] = {
            time: second,
            requests: 0,
            getRequests: 0,
            postRequests: 0,
          };
        }
        acc[second].requests++;
        if (item.Method === "GET") acc[second].getRequests++;
        if (item.Method === "POST") acc[second].postRequests++;
        return acc;
      }, {});

      // Получаем текущее время работы сервера
      const currentUptime = Math.floor(stats.Uptime.TotalSeconds);

      // Создаем массив со всеми секундами от 0 до текущего времени
      const result = [];
      for (let time = 0; time <= currentUptime; time++) {
        result.push({
          time,
          requests: groupedBySecond[time]?.requests || 0,
          getRequests: groupedBySecond[time]?.getRequests || 0,
          postRequests: groupedBySecond[time]?.postRequests || 0,
        });
      }

      setFilteredData(result);
    }
  }, [stats, methodFilter, statusFilter]);

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
        <>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Текущая статистика
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Paper sx={{ p: 2, textAlign: "center" }}>
                  <Typography variant="h6">{stats.TotalRequests}</Typography>
                  <Typography color="text.secondary">Всего запросов</Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Paper sx={{ p: 2, textAlign: "center" }}>
                  <Typography variant="h6">{stats.GetRequests}</Typography>
                  <Typography color="text.secondary">GET запросов</Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Paper sx={{ p: 2, textAlign: "center" }}>
                  <Typography variant="h6">{stats.PostRequests}</Typography>
                  <Typography color="text.secondary">POST запросов</Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Paper sx={{ p: 2, textAlign: "center" }}>
                  <Typography variant="h6">
                    {stats.Uptime ? Math.floor(stats.Uptime.TotalSeconds) : 0}
                  </Typography>
                  <Typography color="text.secondary">
                    Время работы (сек)
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
          </Paper>

          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Фильтры
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Метод запроса</InputLabel>
                  <Select
                    value={methodFilter}
                    label="Метод запроса"
                    onChange={(e) => setMethodFilter(e.target.value)}
                  >
                    <MenuItem value="all">Все</MenuItem>
                    <MenuItem value="GET">GET</MenuItem>
                    <MenuItem value="POST">POST</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Статус ответа</InputLabel>
                  <Select
                    value={statusFilter}
                    label="Статус ответа"
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <MenuItem value="all">Все</MenuItem>
                    {stats.StatusCodes.map((sc) => (
                      <MenuItem key={sc.StatusCode} value={sc.StatusCode}>
                        {sc.StatusCode} ({sc.Count})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Paper>

          <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant="h6" gutterBottom>
              График запросов
            </Typography>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  label={{ value: "Время (сек)", position: "bottom" }}
                  tickFormatter={(value) => `${value}с`}
                  interval={Math.floor(stats.Uptime.TotalSeconds / 10)}
                  domain={[0, stats.Uptime.TotalSeconds]}
                />
                <YAxis
                  label={{
                    value: "Количество запросов",
                    angle: -90,
                    position: "insideLeft",
                  }}
                  domain={[0, "dataMax + 1"]}
                  allowDecimals={false}
                />
                <Tooltip
                  formatter={(value) => [
                    value,
                    methodFilter === "all"
                      ? "Запросов в секунду"
                      : `${methodFilter} запросов в секунду`,
                  ]}
                  labelFormatter={(value) => `${value}с`}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="requests"
                  stroke="#8884d8"
                  name={
                    methodFilter === "all"
                      ? "Запросов в секунду"
                      : `${methodFilter} запросов в секунду`
                  }
                  dot={false}
                  connectNulls={true}
                />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </>
      )}
    </Container>
  );
}

export default App;
