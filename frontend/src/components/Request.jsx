const Request = ({ request }) => {
  const date = new Date(request.timestamp);
  const dateString = date.toDateString();
  const timeString = date.toTimeString();

  return (
    <div className="request-box">
      <p className="request-info">
        <strong>{request.method}</strong>
        <br />
        {dateString}
        <br />
        {timeString}
        <br />
      </p>
      <table className="request-content">
        <tr>
          <th>Headers</th>
          <td>
            <div className="scroll-box">
              {typeof request.headers === "string"
                ? request.headers || "empty"
                : "empty"}
            </div>
          </td>
        </tr>
        <tr>
          <th>Body</th>
          <td>
            <div className="scroll-box">
              {typeof request.body === "string"
                ? request.body || "empty"
                : "empty"}
            </div>
          </td>
        </tr>
      </table>
    </div>
  );
};

export default Request;
