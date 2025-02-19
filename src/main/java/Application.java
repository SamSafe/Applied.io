import java.util.*;

/**
 * The Application class defines the behavior of an application at the time of creation.
 * It includes attributes like the date of the application, the requisition number, or the name of the company.
 * Date is instantiated to the date at the time of creation.
 * Several methods exist to update the content of the application class.
 */
public class Application {
    // Tracks the date the application was created
    private String appDate;
    // The
    private String pos;
    private String reqNum;
    private String company;
    private String location;
    private String comments;
    private String resDate;
    private String res;

    public Application(String pos,
                       String reqNum,
                       String company,
                       String location,
                       String comments) {
        Calendar now = Calendar.getInstance();
        int nowYear = now.get(Calendar.YEAR);
        int nowMonth = now.get(Calendar.MONTH);
        int nowDay = now.get(Calendar.DAY_OF_MONTH);
        this.appDate = nowYear + "-" + nowMonth + "-" + nowDay;

        this.pos = pos;

        if (reqNum.isEmpty()) {
            this.reqNum = "Unknown";
        } else {
            this.reqNum = reqNum;
        }

        this.company = company;

        if (location.isEmpty()) {
            this.location = "Unknown";
        } else {
            this.location = location;
        }

        this.comments = comments;
    }

    public void setResDate(String resDate) {
        this.resDate = resDate;
    }

    public void setComments(String comments) {
        this.comments = comments;
    }
}
